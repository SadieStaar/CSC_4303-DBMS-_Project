DROP DATABASE airline;
CREATE DATABASE airline;
USE airline;

-- Person Table
CREATE TABLE person (
    ssn VARCHAR(11) NOT NULL,
    dob DATE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    mid_init CHAR(1),
    last_name VARCHAR(50) NOT NULL,
    PRIMARY KEY (ssn)
);

-- Person Table Triggers
DELIMITER $$
CREATE TRIGGER person_before_insert
BEFORE INSERT ON person
FOR EACH ROW
BEGIN
    -- SSN Format Validation (XXX-XX-XXXX)
    IF NEW.ssn NOT REGEXP '^[0-9]{3}-[0-9]{2}-[0-9]{4}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid SSN format. Use XXX-XX-XXXX';
    END IF;
    -- Date of Birth Validation
    IF NEW.dob > CURDATE() THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Date of birth cannot be in the future';
    END IF;
    -- Name Validation (letters only)
    IF NEW.first_name REGEXP '[^A-Za-z]'
       OR NEW.last_name REGEXP '[^A-Za-z]' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Names may only contain letters';
    END IF;
    -- Name Normalization
    SET NEW.first_name = CONCAT(
        UPPER(LEFT(NEW.first_name, 1)),
        LOWER(SUBSTRING(NEW.first_name, 2))
    );
    SET NEW.last_name = CONCAT(
        UPPER(LEFT(NEW.last_name, 1)),
        LOWER(SUBSTRING(NEW.last_name, 2))
    );
    IF NEW.mid_init IS NOT NULL THEN
        SET NEW.mid_init = UPPER(NEW.mid_init);
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER person_before_update
BEFORE UPDATE ON person
FOR EACH ROW
BEGIN
    -- Prevent SSN Changes
    IF NEW.ssn <> OLD.ssn THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'SSN cannot be updated';
    END IF;
    -- SSN Format Validation (XXX-XX-XXXX)
    IF NEW.ssn NOT REGEXP '^[0-9]{3}-[0-9]{2}-[0-9]{4}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid SSN format. Use XXX-XX-XXXX';
    END IF;
    -- Date of Birth Validation
    IF NEW.dob > CURDATE() THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Date of birth cannot be in the future';
    END IF;
    -- Name Validation (letters only)
    IF NEW.first_name REGEXP '[^A-Za-z]'
       OR NEW.last_name REGEXP '[^A-Za-z]' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Names may only contain letters';
    END IF;
    -- Name Normalization
    SET NEW.first_name = CONCAT(
        UPPER(LEFT(NEW.first_name, 1)),
        LOWER(SUBSTRING(NEW.first_name, 2))
    );
    SET NEW.last_name = CONCAT(
        UPPER(LEFT(NEW.last_name, 1)),
        LOWER(SUBSTRING(NEW.last_name, 2))
    );
    IF NEW.mid_init IS NOT NULL THEN
        SET NEW.mid_init = UPPER(NEW.mid_init);
    END IF;
END$$
DELIMITER ;

-- Passenger Table
CREATE TABLE passenger (
    ssn VARCHAR(11) NOT NULL,
    passport_num VARCHAR(30) NOT NULL,
    email VARCHAR(254),
    phone VARCHAR(25),
    PRIMARY KEY (ssn),
    FOREIGN KEY (ssn) REFERENCES person(ssn)
);

-- Passenger Table Triggers
DELIMITER $$
CREATE TRIGGER passenger_before_insert
BEFORE INSERT ON passenger
FOR EACH ROW
BEGIN
    -- Ensure Person exists (defensive, FK already enforces)
    IF NOT EXISTS (
        SELECT 1 FROM person WHERE ssn = NEW.ssn
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Passenger must exist in Person table';
    END IF;
    -- Passport number validation
    IF NEW.passport_num NOT REGEXP '^[A-Za-z0-9]{6,30}$' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid passport number format';
    END IF;
    -- Email validation
    IF NEW.email IS NOT NULL
       AND NEW.email NOT REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid email format';
    END IF;
    -- Phone validation
    IF NEW.phone IS NOT NULL
       AND NEW.phone NOT REGEXP '^[0-9+() -]{7,25}$' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid phone number format';
    END IF;
    -- Require at least one contact method
    IF NEW.email IS NULL AND NEW.phone IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Passenger must have at least one contact method';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER passenger_before_update
BEFORE UPDATE ON passenger
FOR EACH ROW
BEGIN
    -- Prevent SSN Changes
    IF NEW.ssn <> OLD.ssn THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Passenger SSN cannot be updated';
    END IF;
    -- Ensure Person exists (defensive, FK already enforces)
    IF NOT EXISTS (
        SELECT 1 FROM person WHERE ssn = NEW.ssn
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Passenger must exist in Person table';
    END IF;
    -- Passport number validation
    IF NEW.passport_num NOT REGEXP '^[A-Za-z0-9]{6,30}$' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid passport number format';
    END IF;
    -- Email validation
    IF NEW.email IS NOT NULL
       AND NEW.email NOT REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid email format';
    END IF;
    -- Phone validation
    IF NEW.phone IS NOT NULL
       AND NEW.phone NOT REGEXP '^[0-9+() -]{7,25}$' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid phone number format';
    END IF;
    -- Require at least one contact method
    IF NEW.email IS NULL AND NEW.phone IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Passenger must have at least one contact method';
    END IF;
END$$
DELIMITER ;

-- Employee Table
CREATE TABLE employee (
    employee_id VARCHAR(20) NOT NULL,
    ssn VARCHAR(11) NOT NULL,
    salary DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (employee_id),
    UNIQUE (ssn),
    FOREIGN KEY (ssn) REFERENCES person (ssn)
);

-- Employee Table Trigger
DELIMITER $$
CREATE TRIGGER employee_before_insert
BEFORE INSERT ON employee
FOR EACH ROW
BEGIN
    -- Ensure employee exists in Person table (Defensive check; FK enforces this as well)
    IF NOT EXISTS (
        SELECT 1
        FROM person
        WHERE ssn = NEW.ssn
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Employee must reference an existing Person';
    END IF;
    -- Employee ID Validation
    IF NEW.employee_id NOT REGEXP '^[A-Za-z0-9]{4,20}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid employee ID format';
    END IF;
    -- Salary Validation
    IF NEW.salary <= 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Salary must be greater than zero';
    END IF;
    IF NEW.salary > 1000000 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Salary exceeds allowed maximum';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER employee_before_update
BEFORE UPDATE ON employee
FOR EACH ROW
BEGIN
    -- Prevent primary/foreign key changes
    IF NEW.employee_id <> OLD.employee_id THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Employee ID cannot be updated';
    END IF;
    IF NEW.ssn <> OLD.ssn THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Employee SSN cannot be updated';
    END IF;
    -- Ensure employee exists in Person table (Defensive check; FK enforces this as well)
    IF NOT EXISTS (
        SELECT 1
        FROM person
        WHERE ssn = NEW.ssn
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Employee must reference an existing Person';
    END IF;
    -- Employee ID Validation
    IF NEW.employee_id NOT REGEXP '^[A-Za-z0-9]{4,20}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid employee ID format';
    END IF;
    -- Salary Validation
    IF NEW.salary <= 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Salary must be greater than zero';
    END IF;
    IF NEW.salary > 1000000 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Salary exceeds allowed maximum';
    END IF;
END$$
DELIMITER ;


-- Administrator Table
CREATE TABLE administrator (
    employee_id VARCHAR(20) NOT NULL,
    PRIMARY KEY (employee_id),
    FOREIGN KEY (employee_id) REFERENCES employee(employee_id)
);

-- Administrator Table Trigger
DELIMITER $$
CREATE TRIGGER administrator_before_insert
BEFORE INSERT ON administrator
FOR EACH ROW
BEGIN
    -- Ensure administrator exists as an employee
    IF NOT EXISTS (
        SELECT 1
        FROM employee
        WHERE employee_id = NEW.employee_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Administrator must exist in Employee table';
    END IF;
    -- Prevent duplicate administrator assignment (Defensive; PK already enforces uniqueness)
    IF EXISTS (
        SELECT 1
        FROM administrator
        WHERE employee_id = NEW.employee_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Employee is already an administrator';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER administrator_before_update
BEFORE UPDATE ON administrator
FOR EACH ROW
BEGIN
    -- Prevent primary key changes
    IF NEW.employee_id <> OLD.employee_id THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Administrator employee ID cannot be updated';
    END IF;
    -- Ensure administrator exists as an employee
    IF NOT EXISTS (
        SELECT 1
        FROM employee
        WHERE employee_id = NEW.employee_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Administrator must exist in Employee table';
    END IF;
    -- Prevent duplicate administrator assignment (Defensive; PK already enforces uniqueness)
    IF EXISTS (
        SELECT 1
        FROM administrator
        WHERE employee_id = NEW.employee_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Employee is already an administrator';
    END IF;
END$$
DELIMITER ;


-- Flight Crew Table
CREATE TABLE flight_crew (
    employee_id VARCHAR(20) NOT NULL,
    admin_id VARCHAR(20),
    PRIMARY KEY (employee_id),
    FOREIGN KEY (employee_id) REFERENCES employee(employee_id),
    FOREIGN KEY (admin_id) REFERENCES administrator(employee_id)
);

-- Flight Crew Table Triggers
DELIMITER $$
CREATE TRIGGER flight_crew_before_insert
BEFORE INSERT ON flight_crew
FOR EACH ROW
BEGIN
    -- Ensure flight crew member exists as an employee
    IF NOT EXISTS (
        SELECT 1
        FROM employee
        WHERE employee_id = NEW.employee_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Flight crew member must exist in Employee table';
    END IF;
    -- Ensure administrator exists (if provided)
    IF NEW.admin_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM administrator
            WHERE employee_id = NEW.admin_id
        ) THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Administrator must exist to assign flight crew';
        END IF;
    END IF;
    -- Prevent self-assignment / self-approval
    IF NEW.admin_id IS NOT NULL
       AND NEW.employee_id = NEW.admin_id THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Employee cannot administer themselves';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER flight_crew_before_update
BEFORE UPDATE ON flight_crew
FOR EACH ROW
BEGIN
    -- Prevent primary key changes
    IF NEW.employee_id <> OLD.employee_id THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Flight crew employee ID cannot be updated';
    END IF;
    -- Ensure flight crew member exists as an employee
    IF NOT EXISTS (
        SELECT 1
        FROM employee
        WHERE employee_id = NEW.employee_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Flight crew member must exist in Employee table';
    END IF;
    -- Ensure administrator exists (if provided)
    IF NEW.admin_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM administrator
            WHERE employee_id = NEW.admin_id
        ) THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Administrator must exist to assign flight crew';
        END IF;
    END IF;
    -- Prevent self-assignment / self-approval
    IF NEW.admin_id IS NOT NULL
       AND NEW.employee_id = NEW.admin_id THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Employee cannot administer themselves';
    END IF;
END$$
DELIMITER ;


-- Pilot Table
CREATE TABLE pilot (
    employee_id VARCHAR(20) NOT NULL,
    license_num VARCHAR(20) NOT NULL,
    PRIMARY KEY (employee_id),
    FOREIGN KEY (employee_id) REFERENCES flight_crew(employee_id)
);

-- Pilot Table Triggers
DELIMITER $$
CREATE TRIGGER pilot_before_insert
BEFORE INSERT ON pilot
FOR EACH ROW
BEGIN
    -- Ensure pilot exists as a flight crew member
    IF NOT EXISTS (
        SELECT 1
        FROM flight_crew
        WHERE employee_id = NEW.employee_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Pilot must exist in Flight_Crew table';
    END IF;
    -- Pilot License Validation
    IF NEW.license_num NOT REGEXP '^[A-Za-z0-9]{5,20}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid pilot license number format';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER pilot_before_update
BEFORE UPDATE ON pilot
FOR EACH ROW
BEGIN
    -- Prevent primary key changes
    IF NEW.employee_id <> OLD.employee_id THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Pilot employee ID cannot be updated';
    END IF;
    -- Ensure pilot exists as a flight crew member
    IF NOT EXISTS (
        SELECT 1
        FROM flight_crew
        WHERE employee_id = NEW.employee_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Pilot must exist in Flight_Crew table';
    END IF;
    -- Pilot License Validation
    IF NEW.license_num NOT REGEXP '^[A-Za-z0-9]{5,20}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid pilot license number format';
    END IF;
END$$
DELIMITER ;


-- Plane Host Table 
CREATE TABLE plane_host (
    employee_id VARCHAR(20) NOT NULL,
    PRIMARY KEY (employee_id),
    FOREIGN KEY (employee_id) REFERENCES flight_crew(employee_id)
);

-- Plane Host Table Triggers
DELIMITER $$
CREATE TRIGGER plane_host_before_insert
BEFORE INSERT ON plane_host
FOR EACH ROW
BEGIN
    -- Ensure plane host exists as a flight crew member
    IF NOT EXISTS (
        SELECT 1
        FROM flight_crew
        WHERE employee_id = NEW.employee_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Plane host must exist in Flight_Crew table';
    END IF;
    -- Prevent duplicate plane host assignment (Defensive; PK already enforces uniqueness)
    IF EXISTS (
        SELECT 1
        FROM plane_host
        WHERE employee_id = NEW.employee_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Employee is already assigned as a plane host';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER plane_host_before_update
BEFORE UPDATE ON plane_host
FOR EACH ROW
BEGIN
    -- Prevent primary key changes
    IF NEW.employee_id <> OLD.employee_id THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Plane host employee ID cannot be updated';
    END IF;
    -- Ensure plane host exists as a flight crew member
    IF NOT EXISTS (
        SELECT 1
        FROM flight_crew
        WHERE employee_id = NEW.employee_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Plane host must exist in Flight_Crew table';
    END IF;
    -- Prevent duplicate plane host assignment (Defensive; PK already enforces uniqueness)
    IF EXISTS (
        SELECT 1
        FROM plane_host
        WHERE employee_id = NEW.employee_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Employee is already assigned as a plane host';
    END IF;
END$$
DELIMITER ;


-- Aircraft Table
CREATE TABLE aircraft (
    tail_number VARCHAR(20) NOT NULL,
    id VARCHAR(20) NOT NULL,
    model VARCHAR(50) NOT NULL,
    capacity INT NOT NULL CHECK (capacity >= 0),
    status VARCHAR(30),
    PRIMARY KEY (tail_number)
);

-- Aircraft Table Triggers
DELIMITER $$
CREATE TRIGGER aircraft_before_insert
BEFORE INSERT ON aircraft
FOR EACH ROW
BEGIN
    -- Tail Number Validation
    IF NEW.tail_number NOT REGEXP '^[A-Za-z0-9]{3,20}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid tail number format';
    END IF;
    -- Aircraft ID Validation
    IF NEW.id NOT REGEXP '^[A-Za-z0-9]{1,20}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid aircraft ID format';
    END IF;
    -- Model Validation
    IF NEW.model NOT REGEXP '^[A-Za-z0-9 -]{1,50}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid aircraft model format';
    END IF;
    -- Capacity Validation
    IF NEW.capacity < 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Aircraft capacity cannot be negative';
    END IF;
    -- Normalize status text
    IF NEW.status IS NOT NULL THEN
        SET NEW.status = UPPER(NEW.status);
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER aircraft_before_update
BEFORE UPDATE ON aircraft
FOR EACH ROW
BEGIN
    -- Prevent primary key changes
    IF NEW.tail_number <> OLD.tail_number THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Aircraft tail number cannot be updated';
    END IF;
    -- Tail Number Validation
    IF NEW.tail_number NOT REGEXP '^[A-Za-z0-9]{3,20}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid tail number format';
    END IF;
    -- Aircraft ID Validation
    IF NEW.id NOT REGEXP '^[A-Za-z0-9]{1,20}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid aircraft ID format';
    END IF;
    -- Model Validation
    IF NEW.model NOT REGEXP '^[A-Za-z0-9 -]{1,50}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid aircraft model format';
    END IF;
    -- Capacity Validation
    IF NEW.capacity < 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Aircraft capacity cannot be negative';
    END IF;
    -- Normalize status text
    IF NEW.status IS NOT NULL THEN
        SET NEW.status = UPPER(NEW.status);
    END IF;
END$$
DELIMITER ;


-- Flight Table
CREATE TABLE flight (
    flight_num VARCHAR(20) NOT NULL,
    depart_time TIMESTAMP NOT NULL,
    arrival_time TIMESTAMP NOT NULL,
    origin VARCHAR(50) NOT NULL,
    destination VARCHAR(50) NOT NULL,
    status VARCHAR(30),
    gate VARCHAR(20),
    terminal VARCHAR(20),
    tail_number VARCHAR(20) NOT NULL,
    PRIMARY KEY (flight_num),
    FOREIGN KEY (tail_number) REFERENCES aircraft(tail_number)
);

-- Flight Table Triggers
DELIMITER $$
CREATE TRIGGER flight_before_insert
BEFORE INSERT ON flight
FOR EACH ROW
BEGIN
    -- Departure/Arrival Time Validation
    IF NEW.depart_time >= NEW.arrival_time THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Departure time must be before arrival time';
    END IF;
    -- Origin/Destination Validation
    IF NEW.origin = NEW.destination THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Origin and destination cannot be the same';
    END IF;
    -- Aircraft Validation (defensive; FK handles existence)
    IF NOT EXISTS (
        SELECT 1
        FROM aircraft
        WHERE tail_number = NEW.tail_number
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Associated aircraft must exist';
    END IF;
    -- Normalize status
    IF NEW.status IS NOT NULL THEN
        SET NEW.status = UPPER(NEW.status);
    END IF;
    -- Normalize gate and terminal
    IF NEW.gate IS NOT NULL THEN
        SET NEW.gate = UPPER(NEW.gate);
    END IF;

    IF NEW.terminal IS NOT NULL THEN
        SET NEW.terminal = UPPER(NEW.terminal);
    END IF;
    -- Validate origin and destination formatting
    IF NEW.origin NOT REGEXP '^[A-Za-z0-9 -]{1,50}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid origin format';
    END IF;

    IF NEW.destination NOT REGEXP '^[A-Za-z0-9 -]{1,50}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid destination format';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER flight_before_update
BEFORE UPDATE ON flight
FOR EACH ROW
BEGIN
    -- Prevent primary key changes
    IF NEW.flight_num <> OLD.flight_num THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Flight number cannot be updated';
    END IF;
    -- Departure/Arrival Time Validation
    IF NEW.depart_time >= NEW.arrival_time THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Departure time must be before arrival time';
    END IF;
    -- Origin/Destination Validation
    IF NEW.origin = NEW.destination THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Origin and destination cannot be the same';
    END IF;
    -- Aircraft Validation (defensive; FK handles existence)
    IF NOT EXISTS (
        SELECT 1
        FROM aircraft
        WHERE tail_number = NEW.tail_number
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Associated aircraft must exist';
    END IF;
    -- Normalize status
    IF NEW.status IS NOT NULL THEN
        SET NEW.status = UPPER(NEW.status);
    END IF;
    -- Normalize gate and terminal
    IF NEW.gate IS NOT NULL THEN
        SET NEW.gate = UPPER(NEW.gate);
    END IF;
    IF NEW.terminal IS NOT NULL THEN
        SET NEW.terminal = UPPER(NEW.terminal);
    END IF;
    -- Validate origin and destination formatting
    IF NEW.origin NOT REGEXP '^[A-Za-z0-9 -]{1,50}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid origin format';
    END IF;
    IF NEW.destination NOT REGEXP '^[A-Za-z0-9 -]{1,50}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid destination format';
    END IF;
END$$
DELIMITER ;


-- Ticket Table 
CREATE TABLE ticket (
    ticket_num VARCHAR(20) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    seat_num VARCHAR(10) NOT NULL,
    class VARCHAR(20),
    date_booked DATE NOT NULL,
    status VARCHAR(30) NOT NULL,
    passenger_ssn VARCHAR(11) NOT NULL,
    flight_num VARCHAR(20) NOT NULL,
    PRIMARY KEY (ticket_num),
    FOREIGN KEY (passenger_ssn) REFERENCES passenger(ssn),
    FOREIGN KEY (flight_num) REFERENCES flight(flight_num)
);

-- Ticket Table Triggers
DELIMITER $$
CREATE TRIGGER ticket_before_insert
BEFORE INSERT ON ticket
FOR EACH ROW
BEGIN
    -- Passenger Validation (defensive; FK handles existence)
    IF NOT EXISTS (
        SELECT 1
        FROM passenger
        WHERE ssn = NEW.passenger_ssn
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Passenger must exist';
    END IF;
    -- Flight Validation (defensive; FK handles existence)
    IF NOT EXISTS (
        SELECT 1
        FROM flight
        WHERE flight_num = NEW.flight_num
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Flight must exist';
    END IF;
    -- Price Validation
    IF NEW.price <= 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Ticket price must be greater than zero';
    END IF;

    IF NEW.price > 100000 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Ticket price exceeds maximum allowed';
    END IF;
    -- Seat Number Validation
    IF NEW.seat_num NOT REGEXP '^[A-Za-z0-9]{1,10}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid seat number format';
    END IF;
    -- Class Validation / Normalization
    IF NEW.class IS NOT NULL THEN
        SET NEW.class = UPPER(NEW.class);
        IF NEW.class NOT IN ('ECONOMY', 'BUSINESS', 'FIRST') THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Invalid class value';
        END IF;
    END IF;
    -- Status Validation / Normalization
    SET NEW.status = UPPER(NEW.status);
    IF NEW.status NOT IN ('BOOKED', 'CANCELLED', 'CHECKED-IN', 'COMPLETED') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid ticket status';
    END IF;
    -- Booking Date Validation
    IF NEW.date_booked > CURDATE() THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Booking date cannot be in the future';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER ticket_before_update
BEFORE UPDATE ON ticket
FOR EACH ROW
BEGIN
    -- Prevent primary key changes
    IF NEW.ticket_num <> OLD.ticket_num THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Ticket number cannot be updated';
    END IF;
    -- Passenger Validation (defensive; FK handles existence)
    IF NOT EXISTS (
        SELECT 1
        FROM passenger
        WHERE ssn = NEW.passenger_ssn
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Passenger must exist';
    END IF;
    -- Flight Validation (defensive; FK handles existence)
    IF NOT EXISTS (
        SELECT 1
        FROM flight
        WHERE flight_num = NEW.flight_num
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Flight must exist';
    END IF;
    -- Price Validation
    IF NEW.price <= 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Ticket price must be greater than zero';
    END IF;
    IF NEW.price > 100000 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Ticket price exceeds maximum allowed';
    END IF;
    -- Seat Number Validation
    IF NEW.seat_num NOT REGEXP '^[A-Za-z0-9]{1,10}$' THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid seat number format';
    END IF;
    -- Class Validation / Normalization
    IF NEW.class IS NOT NULL THEN
        SET NEW.class = UPPER(NEW.class);
        IF NEW.class NOT IN ('ECONOMY','BUSINESS','FIRST') THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Invalid class value';
        END IF;
    END IF;
    -- Status Validation / Normalization
    SET NEW.status = UPPER(NEW.status);
    IF NEW.status NOT IN ('BOOKED','CANCELLED','CHECKED-IN','COMPLETED') THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid ticket status';
    END IF;
    -- Booking Date Validation
    IF NEW.date_booked > CURDATE() THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Booking date cannot be in the future';
    END IF;
END$$
DELIMITER ;


-- Pilot Of Table 
CREATE TABLE pilot_of (
    pilot_id VARCHAR(20) NOT NULL,
    flight_num VARCHAR(20) NOT NULL,
    PRIMARY KEY (pilot_id, flight_num),
    FOREIGN KEY (pilot_id) REFERENCES pilot(employee_id),
    FOREIGN KEY (flight_num) REFERENCES flight(flight_num)
);

-- Pilot Of Table Triggers
DELIMITER $$
CREATE TRIGGER pilot_of_before_insert
BEFORE INSERT ON pilot_of
FOR EACH ROW
BEGIN
    -- Ensure pilot exists
    IF NOT EXISTS (
        SELECT 1
        FROM pilot
        WHERE employee_id = NEW.pilot_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Pilot must exist';
    END IF;
    -- Ensure flight exists
    IF NOT EXISTS (
        SELECT 1
        FROM flight
        WHERE flight_num = NEW.flight_num
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Flight must exist';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER pilot_of_before_update
BEFORE UPDATE ON pilot_of
FOR EACH ROW
BEGIN
    -- Prevent primary key changes
    IF NEW.pilot_id <> OLD.pilot_id OR NEW.flight_num <> OLD.flight_num THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Pilot assignment cannot be updated';
    END IF;
    -- Ensure pilot exists
    IF NOT EXISTS (
        SELECT 1
        FROM pilot
        WHERE employee_id = NEW.pilot_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Pilot must exist';
    END IF;
    -- Ensure flight exists
    IF NOT EXISTS (
        SELECT 1
        FROM flight
        WHERE flight_num = NEW.flight_num
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Flight must exist';
    END IF;
END$$
DELIMITER ;


-- Staff of table (M:N)
CREATE TABLE staff_of (
    plane_host_id VARCHAR(20) NOT NULL,
    flight_num VARCHAR(20) NOT NULL,
    PRIMARY KEY (plane_host_id, flight_num),
    FOREIGN KEY (plane_host_id) REFERENCES plane_host(employee_id),
    FOREIGN KEY (flight_num) REFERENCES flight(flight_num)
);

-- Staff Of Table Triggers
DELIMITER $$
CREATE TRIGGER staff_of_before_insert
BEFORE INSERT ON staff_of
FOR EACH ROW
BEGIN
    -- Ensure plane host exists
    IF NOT EXISTS (
        SELECT 1
        FROM plane_host
        WHERE employee_id = NEW.plane_host_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Plane host must exist';
    END IF;
    -- Ensure flight exists
    IF NOT EXISTS (
        SELECT 1
        FROM flight
        WHERE flight_num = NEW.flight_num
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Flight must exist';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER staff_of_before_update
BEFORE UPDATE ON staff_of
FOR EACH ROW
BEGIN
    -- Prevent primary key changes
    IF NEW.plane_host_id <> OLD.plane_host_id OR NEW.flight_num <> OLD.flight_num THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Staff assignment cannot be updated';
    END IF;
    -- Ensure plane host exists
    IF NOT EXISTS (
        SELECT 1
        FROM plane_host
        WHERE employee_id = NEW.plane_host_id
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Plane host must exist';
    END IF;
    -- Ensure flight exists
    IF NOT EXISTS (
        SELECT 1
        FROM flight
        WHERE flight_num = NEW.flight_num
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Flight must exist';
    END IF;
END$$
DELIMITER ;


-- Incident Table
CREATE TABLE incident (
    incident_num VARCHAR(20) NOT NULL,
    time_occurred TIMESTAMP NOT NULL,
    description TEXT,
    tail_number VARCHAR(20) NOT NULL,
    PRIMARY KEY (incident_num),
    FOREIGN KEY (tail_number) REFERENCES aircraft(tail_number)
);

-- Incident Table Triggers
DELIMITER $$
CREATE TRIGGER incident_before_insert
BEFORE INSERT ON incident
FOR EACH ROW
BEGIN
    -- Ensure associated aircraft exists
    IF NOT EXISTS (
        SELECT 1
        FROM aircraft
        WHERE tail_number = NEW.tail_number
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Aircraft must exist for the incident';
    END IF;
    -- Timestamp Validation
    IF NEW.time_occurred > NOW() THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Incident timestamp cannot be in the future';
    END IF;
    -- Description Validation
    IF NEW.description IS NULL OR LENGTH(TRIM(NEW.description)) = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Incident description cannot be empty';
    END IF;
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER incident_before_update
BEFORE UPDATE ON incident
FOR EACH ROW
BEGIN
    -- Prevent primary key changes
    IF NEW.incident_num <> OLD.incident_num THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Incident number cannot be updated';
    END IF;
    -- Ensure associated aircraft exists
    IF NOT EXISTS (
        SELECT 1
        FROM aircraft
        WHERE tail_number = NEW.tail_number
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Aircraft must exist for the incident';
    END IF;
    -- Timestamp Validation
    IF NEW.time_occurred > NOW() THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Incident timestamp cannot be in the future';
    END IF;
    -- Description Validation
    IF NEW.description IS NULL OR LENGTH(TRIM(NEW.description)) = 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Incident description cannot be empty';
    END IF;
END$$
DELIMITER ;

-- Constraints
ALTER TABLE passenger
	ADD CONSTRAINT passenger_passport UNIQUE (passport_num),
    ADD CONSTRAINT passenger_email UNIQUE (email),
    ADD CONSTRAINT check_passenger_email CHECK (email IS NULL OR email LIKE '@');
    
ALTER TABLE employee
	ADD CONSTRAINT employee_salary CHECK (salary >= 0);
    
ALTER TABLE aircraft
	ADD CONSTRAINT aircraft_id UNIQUE (id),
    ADD CONSTRAINT aircraft_capacity CHECK (capacity > 0),
    ADD CONSTRAINT aircraft_status CHECK (status IN ('ACTIVE', 'MAINTENCE', 'RETIRED'));
    
ALTER TABLE flight
  ADD CONSTRAINT chk_flight_time CHECK (arrival_time > depart_time),
  ADD CONSTRAINT chk_flight_route CHECK (origin <> destination),
  ADD CONSTRAINT chk_flight_status CHECK (status IN ('SCHEDULED','BOARDING','DELAYED','IN_AIR','LANDED','CANCELLED'));

ALTER TABLE ticket
  ADD CONSTRAINT chk_ticket_price CHECK (price >= 0),
  ADD CONSTRAINT chk_ticket_date CHECK (date_booked <= CURDATE()),
  ADD CONSTRAINT chk_ticket_status CHECK (status IN ('CONFIRMED','CANCELLED','REFUNDED','CHANGED')),
  ADD CONSTRAINT chk_ticket_class CHECK (class IN ('ECONOMY','BUSINESS','FIRST')),
  ADD CONSTRAINT uq_ticket_seat_per_flight UNIQUE (flight_num, seat_num);

ALTER TABLE incident
  ADD CONSTRAINT chk_incident_time CHECK (time_occured <= NOW());
